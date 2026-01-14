export type CropArea = { x: number; y: number; width: number; height: number }

type PhotoCacheKey = string | number | Date | null | undefined

export function getContactPhotoUrl(contact: {
  id: string
  photo_hash?: string | null
  photo_updated_at?: Date | string | null
}): string {
  const baseUrl = `/api/contacts/${contact.id}/photo`
  const cacheKey: PhotoCacheKey = contact.photo_hash || contact.photo_updated_at
  if (!cacheKey) return baseUrl

  let keyValue: string
  if (cacheKey instanceof Date) {
    keyValue = cacheKey.getTime().toString()
  } else if (typeof cacheKey === 'number') {
    keyValue = String(cacheKey)
  } else {
    const parsed = Date.parse(cacheKey)
    keyValue = Number.isNaN(parsed) ? cacheKey : String(parsed)
  }

  return `${baseUrl}?v=${encodeURIComponent(keyValue)}`
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = url
  })
}

export async function cropToSquareDataUrl(options: {
  imageSrc: string
  crop: CropArea
  outputSize: number
  outputMime: string
  quality?: number
}): Promise<{ dataUrl: string; width: number; height: number }> {
  const { imageSrc, crop, outputSize, outputMime, quality } = options
  const image = await createImage(imageSrc)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas not supported')
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize,
  )

  const dataUrl = canvas.toDataURL(outputMime, quality)
  return { dataUrl, width: outputSize, height: outputSize }
}
