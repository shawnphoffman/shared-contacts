import { useRef } from 'react'
import { Camera, Trash2, User } from 'lucide-react'
import Cropper from 'react-easy-crop'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'

interface ContactPhotoSectionProps {
	photoPreviewUrl: string | null
	existingPhotoUrl: string | null
	showExistingPhoto: boolean
	onShowExistingPhotoChange: (show: boolean) => void
	onPhotoFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
	onRemovePhoto: () => void
	// Crop dialog props
	isCropOpen: boolean
	cropSource: string | null
	crop: { x: number; y: number }
	zoom: number
	onCropChange: (crop: { x: number; y: number }) => void
	onZoomChange: (zoom: number) => void
	onCropComplete: (area: any, pixels: any) => void
	onCropSave: () => void
	onCropCancel: () => void
}

export function ContactPhotoSection({
	photoPreviewUrl,
	existingPhotoUrl,
	showExistingPhoto,
	onShowExistingPhotoChange,
	onPhotoFileChange,
	onRemovePhoto,
	isCropOpen,
	cropSource,
	crop,
	zoom,
	onCropChange,
	onZoomChange,
	onCropComplete,
	onCropSave,
	onCropCancel,
}: ContactPhotoSectionProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const hasPhoto = photoPreviewUrl || (showExistingPhoto && existingPhotoUrl)

	return (
		<>
			<div className="flex flex-col items-center gap-3">
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="group relative aspect-square w-28 rounded-full overflow-hidden bg-muted border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{photoPreviewUrl ? (
						<img src={photoPreviewUrl} alt="Contact" className="h-full w-full object-cover" />
					) : showExistingPhoto && existingPhotoUrl ? (
						<img
							src={existingPhotoUrl}
							alt="Contact"
							className="h-full w-full object-cover"
							onError={() => onShowExistingPhotoChange(false)}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<User className="size-10 text-muted-foreground/50" />
						</div>
					)}
					<div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
						<Camera className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
					</div>
				</button>
				<input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoFileChange} className="hidden" />
				{hasPhoto && (
					<Button type="button" variant="ghost" size="sm" onClick={onRemovePhoto} className="text-muted-foreground">
						<Trash2 className="size-3.5 mr-1.5" />
						Remove photo
					</Button>
				)}
			</div>

			<Dialog open={isCropOpen} onOpenChange={open => !open && onCropCancel()}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Crop Photo</DialogTitle>
					</DialogHeader>
					<div className="relative aspect-square w-full bg-black/80">
						{cropSource && (
							<Cropper
								image={cropSource}
								crop={crop}
								zoom={zoom}
								aspect={1}
								cropShape="round"
								onCropChange={onCropChange}
								onZoomChange={onZoomChange}
								onCropComplete={onCropComplete}
							/>
						)}
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-muted-foreground">Zoom</span>
						<input
							type="range"
							min={1}
							max={3}
							step={0.1}
							value={zoom}
							onChange={event => onZoomChange(Number(event.target.value))}
							className="flex-1"
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onCropCancel}>
							Cancel
						</Button>
						<Button type="button" onClick={onCropSave}>
							Use photo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
