// import {
//   DeleteObjectsCommand,
//   GetObjectCommand,
//   PutObjectCommand,
//   S3Client,
// } from '@aws-sdk/client-s3'
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// function getS3Config() {
//   const bucketName = Bun.env.S3_BUCKET_NAME
//   const region = Bun.env.S3_BUCKET_REGION
//   const accessKeyId = Bun.env.S3_ACCESS_KEY
//   const secretAccessKey = Bun.env.S3_SECRET_KEY
//   const awsBucketUrl = Bun.env.AWS_BUCKET_URL

//   if (!bucketName || !region || !accessKeyId || !secretAccessKey || !awsBucketUrl) {
//     const error = new Error(
//       'Missing required S3 environment variables. Please set S3_BUCKET_NAME, S3_BUCKET_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, and AWS_BUCKET_URL in your .env file.'
//     )
//     console.error('❌ [S3] Missing environment variables:', error.message)
//     throw error
//   }

//   if (accessKeyId.length < 16 || accessKeyId.length > 128) {
//     console.warn('⚠️ [S3] Access key length seems unusual:', accessKeyId.length)
//   }

//   if (accessKeyId.includes(' ') || secretAccessKey.includes(' ')) {
//     console.warn(
//       '⚠️ [S3] Warning: Credentials may contain spaces - check for leading/trailing whitespace'
//     )
//   }
//   return {
//     bucketName,
//     region,
//     accessKeyId: accessKeyId.trim(),
//     secretAccessKey: secretAccessKey.trim(),
//     awsBucketUrl,
//   }
// }

// let s3ClientInstance: S3Client | null = null
// let s3ConfigInstance: ReturnType<typeof getS3Config> | null = null
// let s3ConfigError: Error | null = null

// function getS3Client() {
//   if (s3ConfigError) {
//     throw s3ConfigError
//   }
//   if (!s3ClientInstance) {
//     try {
//       const config = getS3Config()
//       s3ConfigInstance = config
//       s3ClientInstance = new S3Client({
//         region: config.region,
//         credentials: {
//           accessKeyId: config.accessKeyId,
//           secretAccessKey: config.secretAccessKey,
//         },
//       })
//     } catch (error) {
//       s3ConfigError = error as Error
//       console.error('❌ [S3] Error initializing S3 client:', error)
//       throw error
//     }
//   }
//   return s3ClientInstance
// }

// function getS3ConfigInstance() {
//   if (s3ConfigError) {
//     throw s3ConfigError
//   }
//   if (!s3ConfigInstance) {
//     try {
//       s3ConfigInstance = getS3Config()
//     } catch (error) {
//       s3ConfigError = error as Error
//       throw error
//     }
//   }
//   return s3ConfigInstance
// }

// export function getS3ClientInstance() {
//   return getS3Client()
// }

// export const s3Client = new Proxy({} as S3Client, {
//   get(_target, prop) {
//     return getS3Client()[prop as keyof S3Client]
//   },
// })

// export const uploadFileToS3 = async (file: File, directory?: string): Promise<string> => {
//   const config = getS3ConfigInstance()
//   const client = getS3Client()

//   const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
//   const extension = file.type.split('/')[1] || 'bin'
//   const uniqueKey = `${sanitizedFileName}-${Date.now()}.${extension}`
//   const key = directory ? `${directory}/${uniqueKey}` : uniqueKey

//   const buffer = Buffer.from(await file.arrayBuffer())

//   try {
//     await client.send(
//       new PutObjectCommand({
//         Bucket: config.bucketName,
//         Key: key,
//         Body: buffer,
//         ContentType: file.type || 'application/octet-stream',
//       })
//     )
//     return `${config.awsBucketUrl}/${key}`
//   } catch (error: unknown) {
//     const s3Error = error as {
//       Code?: string
//       name?: string
//       message?: string
//       $metadata?: { httpStatusCode?: number }
//     }
//     console.error('❌ [S3] Upload error details:', {
//       bucket: config.bucketName,
//       key,
//       region: config.region,
//       accessKeyId: `${config.accessKeyId.substring(0, 8)}...`,
//       errorCode: s3Error?.Code,
//       errorMessage: s3Error?.message,
//       statusCode: s3Error?.$metadata?.httpStatusCode,
//     })

//     if (s3Error?.Code === 'SignatureDoesNotMatch' || s3Error?.name === 'SignatureDoesNotMatch') {
//       throw new Error(
//         'S3 signature mismatch. Please verify your S3_ACCESS_KEY and S3_SECRET_KEY are correct and match each other. ' +
//           `Access Key ID: ${config.accessKeyId.substring(0, 8)}... Check your .env file for typos, incorrect values, or trailing whitespace.`
//       )
//     }

//     throw error
//   }
// }

// export const deleteObjectsFromS3 = async (keys: string | string[]): Promise<void> => {
//   const config = getS3ConfigInstance()
//   const client = getS3Client()
//   const keysArray = Array.isArray(keys) ? keys : [keys]

//   // Extract keys from URLs if full URLs are provided
//   const s3Keys = keysArray.map(key => {
//     if (key.startsWith('http://') || key.startsWith('https://')) {
//       const url = new URL(key)
//       return url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname
//     }
//     return key
//   })

//   await client.send(
//     new DeleteObjectsCommand({
//       Bucket: config.bucketName,
//       Delete: {
//         Objects: s3Keys.map(key => ({ Key: key })),
//         Quiet: false,
//       },
//     })
//   )
// }

// export const generateUploadUrl = async (key: string, expiresIn = 3600): Promise<string> => {
//   const config = getS3ConfigInstance()
//   const client = getS3Client()
//   const command = new PutObjectCommand({
//     Bucket: config.bucketName,
//     Key: key,
//   })

//   return getSignedUrl(client, command, { expiresIn })
// }

// export const generateDownloadUrl = async (
//   key: string,
//   expiresIn = 3600,
//   options?: { download?: boolean; filename?: string }
// ): Promise<string> => {
//   try {
//     const config = getS3ConfigInstance()
//     const client = getS3Client()

//     // Extract key from URL if full URL is provided
//     let s3Key = key
//     if (key.startsWith('http://') || key.startsWith('https://')) {
//       const url = new URL(key)
//       s3Key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname
//     }

//     const command = new GetObjectCommand({
//       Bucket: config.bucketName,
//       Key: s3Key,
//       ...(options?.download
//         ? {
//             ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
//               options.filename ?? s3Key.split('/').pop() ?? 'download'
//             )}"`,
//           }
//         : {}),
//     })

//     return getSignedUrl(client, command, { expiresIn })
//   } catch (error) {
//     console.error('❌ [S3] Error generating download URL:', error)
//     // If S3 is not configured or fails, return the original key/URL
//     // This prevents the entire request from failing
//     if (key.startsWith('http://') || key.startsWith('https://')) {
//       return key
//     }
//     // If it's just a key, we can't generate a URL, so throw to be handled by caller
//     throw error
//   }
// }

// export const generatePublicUploadUrl = async (key: string, expiresIn = 3600): Promise<string> => {
//   const config = getS3ConfigInstance()
//   const client = getS3Client()
//   const command = new PutObjectCommand({
//     Bucket: config.bucketName,
//     Key: key,
//   })

//   return getSignedUrl(client, command, { expiresIn })
// }

// export const getPublicAssetUrl = (key: string): string => {
//   const config = getS3ConfigInstance()
//   // Extract key from URL if full URL is provided
//   let s3Key = key
//   if (key.startsWith('http://') || key.startsWith('https://')) {
//     const url = new URL(key)
//     s3Key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname
//   }
//   return `${config.awsBucketUrl}/${s3Key}`
// }

// export const keysToSignedUrls = async (
//   keys: string | string[],
//   expiresIn = 7 * 24 * 3600,
//   options?: { download?: boolean }
// ): Promise<string | string[]> => {
//   const keysArray = Array.isArray(keys) ? keys : [keys]

//   const urls = await Promise.all(keysArray.map(key => generateDownloadUrl(key, expiresIn, options)))

//   return Array.isArray(keys) ? urls : urls[0]
// }
