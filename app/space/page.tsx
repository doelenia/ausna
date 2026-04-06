import { redirect } from 'next/navigation'

/** Legacy space index — personal spaces live at `/spaces`. */
export default function SpaceIndexRedirect() {
  redirect('/spaces')
}
