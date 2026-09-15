import { useCallback, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import Cropper, { Area, Point } from "react-easy-crop";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import RotateLeftRoundedIcon from "@mui/icons-material/Rotate90DegreesCcwRounded";
import RotateRightRoundedIcon from "@mui/icons-material/Rotate90DegreesCwRounded";
import { getCroppedImageFile } from "../../utils/cropImage";

type CoverPhotoUploaderProps = {
  value?: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
  disabled?: boolean;
  title?: string;
  helperText?: string;
  aspect?: number;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_MB = 8;

const ZoomSlider = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => (
  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
    <Tooltip title="Zoom out">
      <IconButton size="small" onClick={() => onChange(Math.max(1, Number((value - 0.1).toFixed(2))))}>
        <ZoomOutRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Slider
      value={value}
      min={1}
      max={3.5}
      step={0.05}
      onChange={(_event, newValue) => onChange(newValue as number)}
      aria-label="Zoom"
      sx={{ flexGrow: 1 }}
    />
    <Tooltip title="Zoom in">
      <IconButton size="small" onClick={() => onChange(Math.min(3.5, Number((value + 0.1).toFixed(2))))}>
        <ZoomInRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  </Stack>
);

export default function CoverPhotoUploader({
  value,
  onChange,
  disabled,
  title = "Cover photo",
  helperText = "Select a wide image and drag to reposition the focal point.",
  aspect = 3,
}: CoverPhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => value ?? null, [value]);

  const validateFile = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload a JPG, PNG, or WebP image.";
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Image must be smaller than ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setDialogOpen(true);
      setZoom(1.2);
      setRotation(0);
      setCrop({ x: 0, y: 0 });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedImage(null);
    setCroppedAreaPixels(null);
  };

  const handleSaveCrop = async () => {
    if (!selectedImage) {
      return;
    }
    const croppedFile = await getCroppedImageFile(selectedImage, croppedAreaPixels, rotation, "cover-photo.jpg");
    if (!croppedFile) {
      setError("We couldn't crop this image. Please try another file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(croppedFile, reader.result as string);
      closeDialog();
    };
    reader.onerror = () => {
      setError("We couldn't preview this image. Please try again.");
    };
    reader.readAsDataURL(croppedFile);
  };

  const handleRemove = () => {
    onChange(null, null);
    setError(null);
  };

  return (
    <>
      <Stack spacing={1}>
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
        <Box
          sx={{
            width: "100%",
            height: 180,
            position: "relative",
            borderRadius: 2,
            border: "1px dashed",
            borderColor: preview ? "divider" : "grey.400",
            overflow: "hidden",
            bgcolor: "grey.100",
          }}
        >
          {preview ? (
            <Box
              component="img"
              src={preview}
              alt="Cover preview"
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Stack alignItems="center" justifyContent="center" sx={{ width: "100%", height: "100%" }}>
              <Typography variant="body2" color="text.secondary">
                No cover selected yet
              </Typography>
            </Stack>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={<PhotoCameraIcon />}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? "Change cover" : "Upload cover"}
          </Button>
          {preview && (
            <Tooltip title="Remove pending cover">
              <span>
                <IconButton size="small" onClick={handleRemove} disabled={disabled}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
      </Stack>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>Adjust cover photo</DialogTitle>
        <DialogContent dividers>
          {selectedImage && (
            <Box
              sx={{
                position: "relative",
                width: "100%",
                height: 320,
                bgcolor: "grey.100",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onRotationChange={setRotation}
                onCropComplete={handleCropComplete}
                onZoomChange={setZoom}
              />
            </Box>
          )}
          <Stack spacing={2} sx={{ mt: 3 }}>
            <ZoomSlider value={zoom} onChange={setZoom} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Rotate left">
                <IconButton size="small" onClick={() => setRotation((prev) => prev - 90)}>
                  <RotateLeftRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Rotate right">
                <IconButton size="small" onClick={() => setRotation((prev) => prev + 90)}>
                  <RotateRightRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Typography variant="caption" color="text.secondary">
                {((rotation % 360) + 360) % 360}°
              </Typography>
            </Stack>
            {error && (
              <Typography variant="caption" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveCrop} disabled={!selectedImage}>
            Save cover
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
