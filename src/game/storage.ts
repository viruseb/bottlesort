import { EMPTY_PROGRESS, parse, serialize, type Progress } from './progress'

const KEY = 'bottlesort:progress'

/**
 * Persistance de la progression. Le stockage peut être indisponible
 * (navigation privée, site data bloqué) : dans ce cas la partie reste jouable,
 * la progression n'étant simplement pas retenue d'une session à l'autre.
 */
export function loadProgress(): Progress {
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return EMPTY_PROGRESS
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, serialize(progress))
  } catch {
    // Progression non retenue : sans conséquence sur la partie en cours.
  }
}
