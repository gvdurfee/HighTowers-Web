/** Sensor height (mm) by camera model - matches iPad getSensorHeight */
export function getSensorHeight(cameraModel: string | null | undefined): number {
  if (!cameraModel?.trim()) return 24.0
  const model = cameraModel.trim()
  switch (model) {
    case 'Canon EOS 5D Mark IV':
    case 'Canon EOS 5D Mark III':
    case 'Canon EOS R6':
    case 'Canon EOS R5':
      return 24.0
    case 'NIKON D90':
      return 15.8
    case 'NIKON D100':
      return 15.5
    case 'NIKON D7100':
    case 'NIKON D7200':
      return 15.6
    default:
      return 24.0
  }
}
