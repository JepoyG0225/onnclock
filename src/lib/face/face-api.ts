/**
 * Lazy loader for face-api.js and its model weights.
 *
 * face-api.js is imported at RUNTIME, never at module scope. It reaches for
 * `window`/`document` on import, so a static import would be evaluated during
 * SSR and throw "window is not defined" — the same way the Leaflet map did when
 * the portal home started rendering PunchClock.
 *
 * The three models total roughly 6 MB, so they are fetched once per page load
 * and cached in module state. Weights are served from /face-api/weights (see
 * src/proxy.ts, which already whitelists that path).
 */
export type FaceApi = typeof import('face-api.js')

/**
 * Identifies which model produced an embedding. Stored on the employee as
 * faceEmbeddingModel and checked by /api/face/verify — a mismatch means the
 * employee must re-enrol, because descriptors from different models are not
 * comparable.
 */
export const FACE_MODEL_ID = 'face-api.js@0.22.2/face_recognition_model'

/** Descriptor length face_recognition_model emits. Used as a sanity check. */
export const DESCRIPTOR_LENGTH = 128

const MODEL_URL = '/face-api/weights'

let apiPromise: Promise<FaceApi> | null = null

/** Loads the library and all three models. Safe to call repeatedly. */
export function loadFaceApi(): Promise<FaceApi> {
  if (apiPromise) return apiPromise

  apiPromise = (async () => {
    const faceapi = await import('face-api.js')

    // TinyFaceDetector: fast enough for a live loop on a mid-range phone.
    // Landmark68: the 68 points the mesh overlay is drawn from.
    // FaceRecognitionNet: the 128-float descriptor used for matching.
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])

    return faceapi
  })().catch(err => {
    // Don't cache a rejected promise — a transient network failure would
    // otherwise make every later attempt fail without retrying.
    apiPromise = null
    throw err
  })

  return apiPromise
}

/**
 * Connected point runs of the 68-point landmark model.
 *
 * face-api gives landmarks as a flat array of 68 points with a fixed, documented
 * ordering. These index ranges are what turn that flat list into a face-shaped
 * wireframe: each entry is a polyline, and `closed` marks the loops (eyes, lips)
 * that should join back to their first point.
 */
export const FACE_MESH_PATHS: Array<{ from: number; to: number; closed: boolean }> = [
  { from: 0,  to: 16, closed: false }, // jaw line, ear to ear
  { from: 17, to: 21, closed: false }, // right eyebrow
  { from: 22, to: 26, closed: false }, // left eyebrow
  { from: 27, to: 30, closed: false }, // nose bridge
  { from: 31, to: 35, closed: false }, // nostrils
  { from: 36, to: 41, closed: true  }, // right eye
  { from: 42, to: 47, closed: true  }, // left eye
  { from: 48, to: 59, closed: true  }, // outer lips
  { from: 60, to: 67, closed: true  }, // inner lips
]

/** Total landmark count, i.e. how many dots the mesh animates in. */
export const LANDMARK_COUNT = 68
