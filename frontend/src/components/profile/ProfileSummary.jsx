import { Crosshair, PencilLine } from 'lucide-react'
import surfLevelIcon from '../../assets/icons/surf-level.svg'
import boardIcon from '../../assets/icons/board.svg'
import { SKILL_LEVEL_OPTIONS } from '../../config/skillLevels'
import { SURFBOARD_OPTIONS } from '../../config/surfboards'

// The saved profile details on My Profile, as the pale rows of the Figma
// "My profile" frames: "Surf level: Beginner", "Board: Funboard",
// "Favorite spots: …" and "About me: …". Empty optional fields get a muted
// placeholder. The two custom icons come from Figma; the other two replace
// Figma's text symbols (⌖ ✎) with lucide icons, like the rest of the app.

// The readable label of a stored value ("mid-length" -> "Mid-length")
function labelOf(options, value) {
  return options.find((option) => option.value === value)?.label ?? value
}

function Row({ icon, label, children }) {
  return (
    <div className="flex min-h-12 items-start gap-2.5 rounded-xl bg-card py-3.5 pr-3 pl-4 text-[13px] text-ink">
      <span aria-hidden="true" className="flex size-[21px] shrink-0 items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="inline">{label}: </dt>
        <dd className="inline break-words">{children}</dd>
      </div>
    </div>
  )
}

const Empty = ({ children }) => <span className="text-muted">{children}</span>

function ProfileSummary({ profile }) {
  const spotNames = (profile.favoriteSpots ?? []).map((spot) => spot.name)

  return (
    <dl className="flex flex-col gap-2.5" aria-label="Profile details">
      <Row icon={<img src={surfLevelIcon} alt="" width="15" height="16" />} label="Surf level">
        {labelOf(SKILL_LEVEL_OPTIONS, profile.skillLevel)}
      </Row>
      <Row icon={<img src={boardIcon} alt="" width="12" height="18" />} label="Board">
        {profile.boardType ? labelOf(SURFBOARD_OPTIONS, profile.boardType) : <Empty>Not specified</Empty>}
      </Row>
      <Row icon={<Crosshair size={17} strokeWidth={1.5} className="text-teal" />} label="Favorite spots">
        {spotNames.length > 0 ? spotNames.join(', ') : <Empty>No favorite spots added</Empty>}
      </Row>
      <Row icon={<PencilLine size={16} strokeWidth={1.5} className="text-teal" />} label="About me">
        {profile.about ? <span className="whitespace-pre-line">{profile.about}</span> : <Empty>No bio added yet</Empty>}
      </Row>
    </dl>
  )
}

export default ProfileSummary
