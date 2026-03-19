import fs from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { findSampleLogoById, getSampleLogoFilePath } from '@/lib/sample-logos'

const contentTypes: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

export async function GET(_: Request, { params }: { params: { logoId: string } }) {
  const sampleLogo = findSampleLogoById(params.logoId)

  if (!sampleLogo) {
    return new NextResponse('Not found', { status: 404 })
  }

  const filePath = getSampleLogoFilePath(sampleLogo.fileName)

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const extension = path.extname(sampleLogo.fileName).toLowerCase()
  const contentType = contentTypes[extension] ?? 'application/octet-stream'
  const bytes = await fs.promises.readFile(filePath)

  return new NextResponse(bytes, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': contentType
    }
  })
}