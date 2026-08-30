import './style.css'
import { start } from './game/app'

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Élément introuvable : ${id}`)
  return element as T
}

start({
  home: byId('home'),
  game: byId('game'),
  board: byId('board'),
  title: byId('title'),
  status: byId('status'),
  banner: byId('banner'),
  score: byId('score'),
  next: byId<HTMLButtonElement>('next'),
})
