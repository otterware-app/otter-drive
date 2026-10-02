import { z } from 'zod'

export const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['user', 'api_key']),
})
export type Actor = z.infer<typeof actorSchema>

export const artifactFileSchema = z.object({
  path: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  sha256: z.string(),
})
export type ArtifactFile = z.infer<typeof artifactFileSchema>

export const artifactVersionSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  label: z.string(),
  entryPath: z.string(),
  createdAt: z.string().datetime(),
  createdBy: actorSchema.nullable(),
  fileCount: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string(),
})
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>

export const artifactPreviewSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
  version: artifactVersionSchema,
  contentType: z.string(),
  resourceBaseUrl: z.string().url(),
})
export const artifactPreviewResponseSchema = z.object({
  data: artifactPreviewSchema,
})
export type ArtifactPreviewResponse = z.infer<
  typeof artifactPreviewResponseSchema
>

export const artifactSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  ownerUserId: z.string().nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  currentVersion: artifactVersionSchema.nullable(),
  versionCount: z.number().int().nonnegative(),
  url: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
})
export type Artifact = z.infer<typeof artifactSchema>

export const artifactBootstrapResponseSchema = z.object({
  data: z.object({
    artifact: artifactSchema,
    versions: z.array(artifactVersionSchema),
    preview: artifactPreviewSchema,
  }),
})
export type ArtifactBootstrapResponse = z.infer<
  typeof artifactBootstrapResponseSchema
>

export const paginationSchema = z.object({
  nextCursor: z.string().nullable(),
})

export const artifactListResponseSchema = z.object({
  data: z.array(artifactSchema),
  pagination: paginationSchema,
})
export type ArtifactListResponse = z.infer<typeof artifactListResponseSchema>

export const artifactResponseSchema = z.object({ data: artifactSchema })
export type ArtifactResponse = z.infer<typeof artifactResponseSchema>

export const artifactVersionsResponseSchema = z.object({
  data: z.array(artifactVersionSchema),
  pagination: paginationSchema,
})
export type ArtifactVersionsResponse = z.infer<
  typeof artifactVersionsResponseSchema
>

export const artifactFilesResponseSchema = z.object({
  data: z.array(artifactFileSchema),
})
export type ArtifactFilesResponse = z.infer<typeof artifactFilesResponseSchema>

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createArtifactInputSchema = z.object({
  slug: z.string().min(1).max(80).regex(slugPattern),
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).default(''),
  entryPath: z.string().min(1).default('index.html'),
  label: z.string().min(1).max(300).default('Initial version'),
})
export type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>

export const updateArtifactInputSchema = z
  .object({
    slug: z.string().min(1).max(80).regex(slugPattern).optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2_000).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'No updates supplied')
export type UpdateArtifactInput = z.infer<typeof updateArtifactInputSchema>

export const moveArtifactInputSchema = z.object({
  organizationId: z.string().min(1),
})
export type MoveArtifactInput = z.infer<typeof moveArtifactInputSchema>

export const createUploadInputSchema = z.object({
  label: z.string().min(1).max(300),
  entryPath: z.string().min(1),
  expectedCurrentVersion: z.number().int().nonnegative().optional(),
  /** Carry forward unchanged files from this version when publishing edits. */
  baseVersion: z.number().int().positive().optional(),
  files: z
    .array(
      artifactFileSchema.extend({
        path: z
          .string()
          .min(1)
          .refine((value) => !value.startsWith('/') && !value.includes('..')),
      }),
    )
    .min(1),
})
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>

export const uploadSessionSchema = z.object({
  id: z.string(),
  artifactId: z.string(),
  expiresAt: z.string().datetime(),
  files: z.array(
    z.object({
      path: z.string(),
      uploadUrl: z.string(),
      multipart: z.boolean().default(false),
      partSize: z.number().int().positive().optional(),
    }),
  ),
})
export type UploadSession = z.infer<typeof uploadSessionSchema>

export const uploadSessionResponseSchema = z.object({
  data: uploadSessionSchema,
})

export const multipartUploadPartResponseSchema = z.object({
  data: z.object({
    partNumber: z.number().int().positive(),
    etag: z.string().min(1),
  }),
})

export const completeUploadResponseSchema = z.object({
  data: z.object({
    artifact: artifactSchema,
    version: artifactVersionSchema,
  }),
})
export type CompleteUploadResponse = z.infer<
  typeof completeUploadResponseSchema
>

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

export const deviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string().optional(),
  expires_in: z.number(),
  interval: z.number().optional(),
})

export const deviceTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
})

export type ApiSuccess<T> = { data: T }

export const API_VERSION = 'v1'
export const DEFAULT_API_URL = 'https://drive.otterware.app'
