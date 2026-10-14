import { Capacitor } from '@capacitor/core';

/** Base64 of a blob's bytes, in chunks so a large workbook does not overflow the call stack. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * In the iOS/Android app a browser download link does nothing (the WebView has no download
 * manager), so the file is written to the app's cache and handed to the system share sheet,
 * where the user saves it to Files or opens it in Excel, Telegram, WhatsApp… Returns false
 * outside the app, where the browser download is used instead.
 */
export async function shareFileNatively(blob: Blob, fileName: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: fileName, files: [uri], dialogTitle: 'Сохранить или отправить файл' });
  } catch (error) {
    // Closing the share sheet without choosing an app is not an error.
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return true;
    throw error;
  }
  return true;
}
