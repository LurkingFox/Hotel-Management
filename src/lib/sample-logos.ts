import fs from 'node:fs'
import path from 'node:path'

export type SampleLogo = {
  fileName: string
  id: string
  label: string
  url: string
}

const sampleLogoDirectory = path.join(process.cwd(), 'Hotel Logos')
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function createId(fileName: string) {
  return encodeURIComponent(fileName)
}

function createLabel(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '')
}

export function getSampleLogos(): SampleLogo[] {
  if (!fs.existsSync(sampleLogoDirectory)) {
    return []
  }

  return fs
    .readdirSync(sampleLogoDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      fileName: entry.name,
      id: createId(entry.name),
      label: createLabel(entry.name),
      url: `/api/sample-logos/${createId(entry.name)}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function findSampleLogoById(id: string) {
  const normalizedId = decodeURIComponent(id)
  return getSampleLogos().find((logo) => logo.id === id || logo.fileName === normalizedId || logo.fileName === id) ?? null
}

export function getSampleLogoFilePath(fileName: string) {
  return path.join(sampleLogoDirectory, fileName)
}