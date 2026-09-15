import { Area } from "react-easy-crop";

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

const toRadian = (degree: number) => (degree * Math.PI) / 180;

export async function getCroppedImageFile(
  imageSrc: string,
  croppedPixels: Area | null,
  rotation: number = 0,
  fileName = "profile-photo.jpg",
  mimeType = "image/jpeg",
): Promise<File | null> {
  if (!croppedPixels) {
    return null;
  }

  try {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const radians = toRadian(rotation);
    const rotatedWidth =
      Math.abs(Math.cos(radians) * image.width) +
      Math.abs(Math.sin(radians) * image.height);
    const rotatedHeight =
      Math.abs(Math.sin(radians) * image.width) +
      Math.abs(Math.cos(radians) * image.height);

    canvas.width = rotatedWidth;
    canvas.height = rotatedHeight;

    ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
    ctx.rotate(radians);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const croppedCanvas = document.createElement("canvas");
    const croppedCtx = croppedCanvas.getContext("2d");
    if (!croppedCtx) {
      return null;
    }

    croppedCanvas.width = croppedPixels.width;
    croppedCanvas.height = croppedPixels.height;
    croppedCtx.drawImage(
      canvas,
      croppedPixels.x,
      croppedPixels.y,
      croppedPixels.width,
      croppedPixels.height,
      0,
      0,
      croppedPixels.width,
      croppedPixels.height,
    );

    return new Promise((resolve, reject) => {
      croppedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to generate image"));
            return;
          }
          const file = new File([blob], fileName, { type: mimeType });
          resolve(file);
        },
        mimeType,
        0.92,
      );
    });
  } catch (error) {
    console.error("Failed to crop image", error);
    return null;
  }
}
