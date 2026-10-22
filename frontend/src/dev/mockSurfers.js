// Mock surfers for the /ui-preview page only. Not real user data.
// Portraits are the sample images from the Figma design.
import marianaSilva from './mock-avatars/mariana-silva.png'
import lucasCosta from './mock-avatars/lucas-costa.png'
import jamieLee from './mock-avatars/jamie-lee.png'
import emmaLaurent from './mock-avatars/emma-laurent.jpg'

export const mockSurfers = [
  {
    id: 'mariana',
    name: 'Mariana Silva',
    avatarUrl: marianaSilva,
    level: 'Intermediate',
    status: 'ACTIVE',
    spot: 'Carcavelos',
    board: 'Shortboard',
  },
  {
    id: 'lucas',
    name: 'Lucas Costa',
    avatarUrl: lucasCosta,
    level: 'Beginner',
    status: 'COMING_SOON',
    time: '16:30',
    spot: 'Costa da Caparica',
    board: 'Funboard',
  },
  {
    id: 'jamie',
    name: 'Jamie Lee',
    avatarUrl: jamieLee,
    level: 'Advanced',
    status: 'AT_SPOT',
    spot: 'Ribeira d’Ilhas',
    board: 'Longboard',
  },
  {
    id: 'emma',
    name: 'Emma Laurent',
    avatarUrl: emmaLaurent,
    level: 'Beginner',
    status: 'OFF',
    spot: 'Costa da Caparica',
    board: 'Funboard',
  },
  {
    id: 'noah',
    name: 'Noah Pereira',
    avatarUrl: null,
    level: 'Intermediate',
    status: 'ACTIVE',
    spot: 'Ericeira',
    board: 'Fish',
  },
]

export const levelOptions = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]
