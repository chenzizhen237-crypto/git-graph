/** Shows the open sheet (lib/sheets), if any. */
import { useSheet } from '../lib/sheets'
import { ConflictEditor } from './ConflictEditor'
import { FileHistory } from './FileHistory'
import { RebaseEditor } from './RebaseEditor'

export function Sheets() {
  const sheet = useSheet()
  if (!sheet) return null
  if (sheet.kind === 'history') return <FileHistory key={sheet.path} path={sheet.path} tab={sheet.tab} />
  if (sheet.kind === 'conflict') return <ConflictEditor key={sheet.path} path={sheet.path} />
  return <RebaseEditor key={sheet.base} base={sheet.base} />
}
