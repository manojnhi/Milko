// Android / iOS: file system picker, share sheet aur system print.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

export const pdfMode = 'share';

const cacheFile = (name) => {
  const file = new File(Paths.cache, name.replace(/[^\w.\-]+/g, '_'));
  if (file.exists) file.delete();
  return file;
};

async function share(uri, mimeType) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Save / Share' });
}

/** content: string ya Uint8Array. Android me "save" share sheet se hota hai (Files/Drive/WhatsApp). */
export async function saveFile(name, content, mimeType) {
  const file = cacheFile(name);
  file.create();
  file.write(content);
  await share(file.uri, mimeType);
}

export async function pickFile(maxBytes) {
  // Android MIME types har file manager me bharosemand nahi, isliye extension baad me check hota hai.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  const size = asset.size ?? file.size;
  if (size > maxBytes) throw new Error(`File is too large (max ${Math.round(maxBytes / 1048576)} MB)`);
  const bytes = await file.bytes();
  try { file.delete(); } catch { /* cache copy; OS baad me saaf kar dega */ }
  return { name: asset.name, bytes };
}

export const printHtml = (html) => Print.printAsync({ html });

export async function savePdf(html, name, landscape) {
  // A4 points
  const { uri } = await Print.printToFileAsync({ html, width: landscape ? 842 : 595, height: landscape ? 595 : 842 });
  const target = cacheFile(name);
  new File(uri).move(target);
  await share(target.uri, 'application/pdf');
}
