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

// Product photos look best (and identical across the product page, cards and
// "similar items") as squares of at least this size. See productImageAdvice.
export const PRODUCT_IMAGE_SIZE = 2000;
export const PRODUCT_IMAGE_MIN = 1600;
export const PRODUCT_IMAGE_TIPS =
  "Product photos: square, 2000 × 2000 px (at least 1600 × 1600), with the piece centred and filling about 70–80% of the frame.";

async function imageSize(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

// A warning (not an error) for a product photo that isn't square or is too
// small, or "" when it's fine. Videos are not checked.
export async function productImageAdvice(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) return "";
  const size = await imageSize(file);
  if (!size) return "";
  const { width, height } = size;
  const square = Math.abs(width - height) <= Math.max(width, height) * 0.02;
  const large = Math.min(width, height) >= PRODUCT_IMAGE_MIN;
  if (square && large) return "";
  const issue = !square
    ? !large
      ? "isn't square and is small"
      : "isn't square"
    : "is small";
  return `${file.name} is ${width} × ${height} px and ${issue}. For best results use a square image, at least ${PRODUCT_IMAGE_MIN} × ${PRODUCT_IMAGE_MIN} (ideally ${PRODUCT_IMAGE_SIZE} × ${PRODUCT_IMAGE_SIZE}).`;
}

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
