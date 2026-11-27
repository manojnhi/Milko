// Photo/logo ko chhota JPEG data URI banakar DB me rakhte hain: teeno platforms par persist hota hai aur backup me aata hai.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export const hasCamera = Platform.OS !== 'web';

/** source: 'camera' | 'gallery'. Cancel = null. Permission na mile to error.code = 'PERMISSION'. */
export async function pickPhoto(source, { square = true, width = 400, png = false } = {}) {
  const options = { mediaTypes: ['images'], allowsEditing: square, aspect: [1, 1], quality: 0.8 };
  let result;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      const e = new Error('Camera permission denied');
      e.code = 'PERMISSION';
      throw e;
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    // Android/iOS ka system photo picker alag permission nahi mangta.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (!asset.width || asset.width > width) context.resize({ width });
  const image = await context.renderAsync();
  const out = await image.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.7, base64: true });
  return `data:image/${png ? 'png' : 'jpeg'};base64,${out.base64}`;
}
