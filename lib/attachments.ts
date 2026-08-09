/**
 * Picking a supporting document and uploading it.
 *
 * Every form that attaches proof does it the same way: pick a file, POST it to
 * `/v1/mobile/uploads`, keep the returned **key** and send that key with the
 * request — as `supportingDocKeys`, `attachmentKey` or `iconKey` depending on
 * which form it is. The file itself never travels inside the request body.
 *
 * `purpose` decides which folder the key lands in server-side, so it is worth
 * passing even though it is optional.
 *
 * The picker is a native module — after adding it, rebuild the dev client
 * (`npx expo run:android` / `run:ios`); a JS reload is not enough.
 */
import * as DocumentPicker from 'expo-document-picker';
import { uploads } from '@/lib/api/endpoints';
import type { UploadResult } from '@/types';

/** The server rejects anything over this, so the picker catches it first. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadPurpose = 'permission' | 'profile-request' | 'group-icon';

export type PickedFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

export class AttachmentError extends Error {}

/** Opens the system picker. Returns null when the user backs out. */
export async function pickDocument(
  types: string[] = ['application/pdf', 'image/*']
): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset) return null;

  if (asset.size != null && asset.size > MAX_UPLOAD_BYTES) {
    throw new AttachmentError('That file is over 5 MB. Pick a smaller one.');
  }

  return {
    uri: asset.uri,
    name: asset.name ?? 'attachment',
    type: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? undefined,
  };
}

/** Picks and uploads in one step — returns the storage key to attach. */
export async function pickAndUpload(
  purpose?: UploadPurpose,
  types?: string[]
): Promise<{ upload: UploadResult; file: PickedFile } | null> {
  const file = await pickDocument(types);
  if (!file) return null;

  const upload = await uploads.create(
    { uri: file.uri, name: file.name, type: file.type },
    purpose
  );
  return { upload, file };
}

/** Opens an attachment by key, using a freshly signed 5-minute read URL. */
export async function attachmentUrl(key: string) {
  const { url } = await uploads.signedUrl(key);
  return url;
}
