import { accountTile } from '../focus'
import { useUi } from '../state'
import { AccountDialog } from './AccountDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { ImportDialog } from './ImportDialog'

// Dialogs opened from the account menu: the menu item that opened them is gone by the time they
// close, so focus goes back to that account's rail tile.
const menuTile = () => accountTile(useUi.getState().menuTrigger)

export function Dialogs() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'add':
      return <AccountDialog />
    case 'edit':
      return <AccountDialog key={dialog.id} editId={dialog.id} returnFocus={menuTile} />
    case 'import':
      return <ImportDialog />
    case 'confirm':
      return <ConfirmDialog {...dialog} returnFocus={dialog.accountId ? menuTile : undefined} />
  }
}
