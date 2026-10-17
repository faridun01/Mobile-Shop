/** Map the visible central aiming band through an object-fit: cover video preview. */
export function serialScanRegion(videoWidth: number, videoHeight: number, previewWidth: number, previewHeight: number) {
  const scale = Math.max(previewWidth / videoWidth, previewHeight / videoHeight);
  const width = Math.min(videoWidth, Math.min(440, previewWidth * 0.9) / scale);
  const height = Math.min(videoHeight, Math.min(200, Math.max(120, previewHeight * 0.6)) / scale);
  return { x: (videoWidth - width) / 2, y: (videoHeight - height) / 2, width, height };
}
