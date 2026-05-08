import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';

let model = null;
let processor = null;

export async function loadBgRemovalModel(onProgress) {
  if (model && processor) return;
  model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
    device: 'auto',
    progress_callback: onProgress,
  });
  processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: 'ImageFeatureExtractor',
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });
}

export async function removeBackground(imageDataUrl) {
  if (!model || !processor) await loadBgRemovalModel();
  const img = await RawImage.fromURL(imageDataUrl);
  const { pixel_values } = await processor(img);
  const { output } = await model({ input: pixel_values });

  const maskData = (
    await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(
      img.width,
      img.height,
    )
  ).data;

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img.toCanvas(), 0, 0);
  const pixelData = ctx.getImageData(0, 0, img.width, img.height);
  for (let i = 0; i < maskData.length; i++) {
    pixelData.data[4 * i + 3] = maskData[i];
  }
  ctx.putImageData(pixelData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function isModelLoaded() {
  return model !== null && processor !== null;
}
