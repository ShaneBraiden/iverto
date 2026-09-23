/**
 * Picking a supporting document and uploading it.
 *
 * Every form that attaches proof does it the same way: pick a file, POST it,
 * keep the returned **`fileId`** and send that id with the request — as
 * `supportingDocKeys`, `attachmentKey` or `iconKey` depending on which form
 * it is. The file itself never travels inside the request body.
 *
 * `purpose` decides which folder the file lands in server-side, so it is
 * worth passing even though it is optional.
 *
 * On `/hostel/v2/**` an upload is quarantine-scanned before it's usable
 * (`scanState`); a `/v1/mobile/**` upload has no scan step and is always
 * `not-required`. `pickAndUpload` polls a `pending` result for a few seconds
 * so most callers never see it — `canAttachUpload` is still the gate to check
 * before letting a form submit, for the rare file still scanning past that
 * window, and for the terminal `infected` / `failed` states.
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

/** Only these may be attached to a submission — see the module header. */
export function canAttachUpload(upload: { scanState: UploadResult['scanState'] }) {
  return upload.scanState === 'clean' || upload.scanState === 'not-required';
}

/** A scan that will never become attachable on its own. */
export function uploadRejected(upload: { scanState: UploadResult['scanState'] }) {
  return upload.scanState === 'infected' || upload.scanState === 'failed';
}

/** How long `pickAndUpload` polls a `pending` scan before handing it back anyway. */
const SCAN_POLL_ATTEMPTS = 5;
const SCAN_POLL_DELAY_MS = 1200;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Picks and uploads in one step — returns the `fileId` to attach.
 *
 * If the scan is still `pending` when the upload call returns, this polls
 * `getScan` a few times before giving up and handing back whatever the
 * latest state is; the caller still has to check `canAttachUpload` on the
 * result rather than assume this always resolves it.
 */
export async function pickAndUpload(
  purpose?: UploadPurpose,
  types?: string[]
): Promise<{ upload: UploadResult; file: PickedFile } | null> {
  const file = await pickDocument(types);
  if (!file) return null;

  let upload = await uploads.create(
    { uri: file.uri, name: file.name, type: file.type },
    purpose
  );

  for (let attempt = 0; upload.scanState === 'pending' && attempt < SCAN_POLL_ATTEMPTS; attempt++) {
    await wait(SCAN_POLL_DELAY_MS);
    upload = await uploads.getScan(upload.fileId, upload.filename);
  }

  return { upload, file };
}

/** Opens an attachment by `fileId`, using a freshly signed 5-minute read URL. */
export async function attachmentUrl(fileId: string) {
  const { url } = await uploads.signedUrl(fileId);
  return url;
}
