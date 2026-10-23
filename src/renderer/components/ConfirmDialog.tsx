import { useUi } from '../state'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

// "Are you sure?" for log out and remove. Cancel comes first and takes the initial focus, so a
// stray Enter never confirms something destructive.
export function ConfirmDialog(p: {
  title: string
  body: string
  confirmLabel: string
  danger: boolean
  onConfirm(): void
  returnFocus?: () => HTMLElement | null
}) {
  const close = () => useUi.getState().openDialog(null)
  return (
    <Dialog
      title={p.title}
      returnFocus={p.returnFocus}
      footer={
        <>
          <Button variant="ghost" data-autofocus onClick={close}>
            Cancel
          </Button>
          <Button
            variant={p.danger ? 'danger' : 'primary'}
            onClick={() => {
              close()
              p.onConfirm()
            }}
          >
            {p.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="m-0">{p.body}</p>
    </Dialog>
  )
}
