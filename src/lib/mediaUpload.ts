// Admin media uploads go straight from the browser to cloud storage: the API
// signs a short-lived upload URL, the file is PUT there (with progress), and the
// API then confirms the stored file is a genuine image or video.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MEDIA_RULES =
  "Images: JPEG, PNG or WebP up to 8 MB · Videos: MP4 or WebM up to 50 MB";

export type MediaType = "image" | "video";
// Where a file is stored. Files are named after the record's ID; a record that
// isn't saved yet gets a temporary name, renamed when it is first saved.
export type UploadTarget = {
  folder: "products" | "categories" | "contents";
  recordId?: number | string | null;
};

// Returns an error message for a file the server would refuse, or "".
export function checkMediaFile(file: File, allowVideo: boolean) {
  if (IMAGE_TYPES.includes(file.type))
    return file.size > MAX_IMAGE_BYTES
      ? `${file.name} is larger than 8 MB. Images can be up to 8 MB.`
      : "";
  if (allowVideo && VIDEO_TYPES.includes(file.type))
    return file.size > MAX_VIDEO_BYTES
      ? `${file.name} is larger than 50 MB. Videos can be up to 50 MB.`
      : "";
  return allowVideo
    ? `${file.name} isn't supported. ${MEDIA_RULES}.`
    : `${file.name} isn't supported. Choose a JPEG, PNG or WebP image up to 8 MB.`;
}

export async function uploadMedia(
  request: (path: string, options?: RequestInit) => Promise<any>,
  file: File,
  target: UploadTarget,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; mediaType: MediaType }> {
  const signed = await request("media/sign", {
    method: "POST",
    body: JSON.stringify({ contentType: file.type, size: file.size, ...target }),
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.uploadUrl);
    for (const [name, value] of Object.entries(signed.headers || {}))
      xhr.setRequestHeader(name, value as string);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload of ${file.name} failed. Please try again.`));
    xhr.onerror = () =>
      reject(
        new Error(
          `Upload of ${file.name} failed. Check your connection and the storage CORS settings.`,
        ),
      );
    xhr.send(file);
  });
  return request("media/confirm", {
    method: "POST",
    body: JSON.stringify({ key: signed.key }),
  });
}
