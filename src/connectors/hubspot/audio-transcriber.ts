import { logger } from "../../shared/logger.js";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const AUDIO_ATTACHMENT_REGEX =
  /Attachment: \[<a href="https?:\/\/[^"]*\/file\/(\d+)\/"[^>]*>([^<]*\.oga)<\/a>\]/gi;

interface TranscriptionResult {
  fileId: string;
  filename: string;
  text?: string;
  error?: string;
}

export class AudioTranscriber {
  private openaiApiKey: string;
  private hubspotApiGet: (path: string) => Promise<Record<string, unknown>>;

  constructor(
    openaiApiKey: string,
    hubspotApiGet: (path: string) => Promise<Record<string, unknown>>,
  ) {
    this.openaiApiKey = openaiApiKey;
    this.hubspotApiGet = hubspotApiGet;
  }

  /**
   * Recorre las comunicaciones, detecta audios .oga en el body HTML
   * y reemplaza las referencias con la transcripcion via Whisper.
   */
  async transcribeCommunicationBodies(
    results: Array<{ id: string; properties: Record<string, string>; [key: string]: unknown }>,
  ): Promise<void> {
    for (const result of results) {
      const body = result.properties?.hs_communication_body;
      if (!body) continue;

      const audioMatches = [...body.matchAll(AUDIO_ATTACHMENT_REGEX)];
      if (audioMatches.length === 0) continue;

      logger.info(
        { communicationId: result.id, audioCount: audioMatches.length },
        "Transcribiendo audios de comunicacion",
      );

      const transcriptions = await Promise.allSettled(
        audioMatches.map((match) => this.transcribeFile(match[1], match[2])),
      );

      let newBody = body;
      for (let i = 0; i < audioMatches.length; i++) {
        const fullMatch = audioMatches[i][0];
        const settlement = transcriptions[i];

        let replacement: string;
        if (settlement.status === "fulfilled" && settlement.value.text) {
          replacement = `[Audio transcripto]: "${settlement.value.text}"`;
        } else {
          const errorMsg =
            settlement.status === "rejected"
              ? settlement.reason?.message
              : settlement.value.error;
          replacement = `[Audio no transcripto: ${errorMsg || "error desconocido"}]`;
          logger.warn(
            { fileId: audioMatches[i][1], error: errorMsg },
            "No se pudo transcribir audio",
          );
        }

        newBody = newBody.replace(fullMatch, replacement);
      }

      result.properties.hs_communication_body = newBody;
    }
  }

  private async transcribeFile(
    fileId: string,
    filename: string,
  ): Promise<TranscriptionResult> {
    // 1. Obtener signed URL desde HubSpot Files API
    let signedUrlData: Record<string, unknown>;
    try {
      signedUrlData = await this.hubspotApiGet(
        `/files/v3/files/${fileId}/signed-url`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ fileId, error: message }, "Error obteniendo signed URL de HubSpot");
      return { fileId, filename, error: `HubSpot Files API error: ${message}` };
    }

    const downloadUrl = (signedUrlData?.url || signedUrlData?.signedUrl) as string | undefined;
    if (!downloadUrl) {
      const apiMsg = (signedUrlData?.message as string) || "respuesta sin URL";
      logger.warn({ fileId, response: signedUrlData }, "Signed URL no disponible");
      return { fileId, filename, error: `HubSpot Files API: ${apiMsg}` };
    }

    // 2. Descargar el archivo de audio
    const fileResponse = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30_000), // audio files can be large
    });
    if (!fileResponse.ok) {
      return {
        fileId,
        filename,
        error: `Error descargando archivo: HTTP ${fileResponse.status}`,
      };
    }
    const audioBuffer = await fileResponse.arrayBuffer();

    // 3. Enviar a OpenAI Whisper para transcripcion
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer]), filename);
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const whisperResponse = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.openaiApiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60_000), // Whisper transcription can be slow
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      return {
        fileId,
        filename,
        error: `Whisper API error ${whisperResponse.status}: ${errorText}`,
      };
    }

    const data = (await whisperResponse.json()) as { text: string };
    logger.info(
      { fileId, filename, chars: data.text.length },
      "Audio transcripto exitosamente",
    );
    return { fileId, filename, text: data.text };
  }
}
