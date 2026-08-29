export type AudioManifest = {
  version: 1;
  generatedAt?: string;
  provider?: string;
  items: Record<string, string>;
};

export const audioKey = (kind: "vocabulary" | "phrase" | "listening", id: string) => `${kind}:${id}`;
export const meetingAudioKey = (meetingId: string, lineIndex: number) => `meeting:${meetingId}:${lineIndex}`;
