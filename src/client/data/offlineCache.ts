/** Cache Storage name of the recipe photos kept for offline use (shared with the service worker). */
export const PHOTO_CACHE = 'photos';

/** Address under which a photo is served and cached. */
export const photoUrl = (photoId: string) => `/api/photos/${photoId}`;
