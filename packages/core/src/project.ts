import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Layer } from './builder'
import type { Frame } from './crop'
import { SHOWCASES, type ShowcaseKind } from './geometry'

// Проект конструктора и его файл для переноса: zip с project.json и картинками

export const PROJECT_FORMAT = 'profile-editor-project'
export const PROJECT_VERSION = 1

export interface ProjectData {
  id: string
  name: string
  updatedAt: number
  kind: ShowcaseKind
  height: number
  frame: Frame | null
  durationMs: number
  fps: number
  format: 'png' | 'jpg'
  hex: boolean
  layers: Layer[]
  background: { blob: Blob; name: string } | null
  // картинки слоёв по их assetId
  assets: Record<string, Blob>
  thumbnail: Blob | null
}

interface FileRef {
  file: string
  type: string
}

interface Manifest {
  format: string
  version: number
  project: Omit<ProjectData, 'background' | 'assets' | 'thumbnail'> & {
    background: (FileRef & { name: string }) | null
    assets: Record<string, FileRef>
    thumbnail: FileRef | null
  }
}

export class ProjectFileError extends Error {}

export async function packProject(project: ProjectData): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const add = async (file: string, blob: Blob): Promise<FileRef> => {
    files[file] = new Uint8Array(await blob.arrayBuffer())
    return { file, type: blob.type }
  }

  const assets: Record<string, FileRef> = {}
  for (const [id, blob] of Object.entries(project.assets)) assets[id] = await add(`assets/${id}`, blob)

  const manifest: Manifest = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    project: {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      kind: project.kind,
      height: project.height,
      frame: project.frame,
      durationMs: project.durationMs,
      fps: project.fps,
      format: project.format,
      hex: project.hex,
      layers: project.layers,
      background: project.background
        ? { ...(await add('background', project.background.blob)), name: project.background.name }
        : null,
      assets,
      thumbnail: project.thumbnail ? await add('thumbnail', project.thumbnail) : null,
    },
  }
  files['project.json'] = strToU8(JSON.stringify(manifest))
  // картинки и видео уже сжаты, повторно жать нет смысла
  return zipSync(files, { level: 0 })
}

export function unpackProject(bytes: Uint8Array): ProjectData {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ProjectFileError('not a zip')
  }
  const raw = files['project.json']
  if (!raw) throw new ProjectFileError('no project.json')

  let manifest: Manifest
  try {
    manifest = JSON.parse(strFromU8(raw)) as Manifest
  } catch {
    throw new ProjectFileError('broken project.json')
  }
  if (manifest.format !== PROJECT_FORMAT || !(manifest.version <= PROJECT_VERSION)) {
    throw new ProjectFileError('unknown format')
  }

  const { project } = manifest
  if (typeof project?.id !== 'string' || !(project.kind in SHOWCASES) || !Array.isArray(project.layers)) {
    throw new ProjectFileError('broken project.json')
  }

  const blob = (ref: FileRef) => {
    const data = files[ref.file]
    if (!data) throw new ProjectFileError(`missing ${ref.file}`)
    return new Blob([data as BlobPart], { type: ref.type })
  }

  const assets: Record<string, Blob> = {}
  for (const [id, ref] of Object.entries(project.assets ?? {})) assets[id] = blob(ref)

  return {
    ...project,
    background: project.background ? { blob: blob(project.background), name: project.background.name } : null,
    assets,
    thumbnail: project.thumbnail ? blob(project.thumbnail) : null,
  }
}
