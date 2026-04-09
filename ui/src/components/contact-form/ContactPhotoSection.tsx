import Cropper from 'react-easy-crop'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
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
	return (
		<>
			<div className="flex items-center gap-4">
				<div className="h-20 w-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
					{photoPreviewUrl ? (
						<img src={photoPreviewUrl} alt="Contact" className="h-full w-full object-cover" />
					) : showExistingPhoto && existingPhotoUrl ? (
						<img src={existingPhotoUrl} alt="Contact" className="h-full w-full object-cover" onError={() => onShowExistingPhotoChange(false)} />
					) : (
						<span className="text-sm text-gray-400">No Photo</span>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<Input type="file" accept="image/*" onChange={onPhotoFileChange} />
					{(photoPreviewUrl || (showExistingPhoto && existingPhotoUrl)) && (
						<Button type="button" variant="outline" onClick={onRemovePhoto}>
							Remove photo
						</Button>
					)}
				</div>
			</div>

			<Dialog open={isCropOpen} onOpenChange={open => !open && onCropCancel()}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Crop Photo</DialogTitle>
					</DialogHeader>
					<div className="relative h-80 w-full bg-black/80">
						{cropSource && (
							<Cropper
								image={cropSource}
								crop={crop}
								zoom={zoom}
								aspect={1}
								onCropChange={onCropChange}
								onZoomChange={onZoomChange}
								onCropComplete={onCropComplete}
							/>
						)}
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm text-gray-500">Zoom</span>
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
