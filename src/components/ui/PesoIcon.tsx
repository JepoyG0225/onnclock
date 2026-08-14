import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPesoSign } from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

/** Official Font Awesome Philippine peso icon. */
export function PesoIcon({ className }: { className?: string }) {
  return (
    <FontAwesomeIcon
      icon={faPesoSign}
      className={cn('inline-block', className)}
      aria-label="Philippine Peso"
    />
  )
}
