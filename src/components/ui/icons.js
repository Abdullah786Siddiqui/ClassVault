import { defineComponent, h } from 'vue'

function createIcon(name, glyph) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () =>
        h('i', {
          ...attrs,
          class: [
            'fa-solid',
            `fa-${glyph}`,
            'cv-icon',
            attrs.class,
          ],
          'aria-hidden': attrs['aria-label'] ? undefined : 'true',
        })
    },
  })
}

export const AlertCircle = createIcon('AlertCircle', 'circle-exclamation')
export const AlertTriangle = createIcon('AlertTriangle', 'triangle-exclamation')
export const Archive = createIcon('Archive', 'box-archive')
export const ArrowLeft = createIcon('ArrowLeft', 'arrow-left')
export const Award = createIcon('Award', 'award')
export const Calendar = createIcon('Calendar', 'calendar')
export const Camera = createIcon('Camera', 'camera')
export const CheckCircle2 = createIcon('CheckCircle2', 'circle-check')
export const ChevronRight = createIcon('ChevronRight', 'chevron-right')
export const Clock = createIcon('Clock', 'clock')
export const Cloud = createIcon('Cloud', 'cloud')
export const CloudDownload = createIcon('CloudDownload', 'cloud-arrow-down')
export const CloudOff = createIcon('CloudOff', 'cloud-slash')
export const Download = createIcon('Download', 'download')
export const Edit3 = createIcon('Edit3', 'pen-to-square')
export const ExternalLink = createIcon('ExternalLink', 'arrow-up-right-from-square')
export const File = createIcon('File', 'file')
export const FileText = createIcon('FileText', 'file-lines')
export const FileUp = createIcon('FileUp', 'file-arrow-up')
export const Folder = createIcon('Folder', 'folder')
export const GraduationCap = createIcon('GraduationCap', 'graduation-cap')
export const Image = createIcon('Image', 'image')
export const Info = createIcon('Info', 'circle-info')
export const Loader2 = createIcon('Loader2', 'spinner')
export const BookOpen = createIcon('BookOpen', 'book-open')
export const Plus = createIcon('Plus', 'plus')
export const RefreshCw = createIcon('RefreshCw', 'arrows-rotate')
export const Trash2 = createIcon('Trash2', 'trash-can')
export const UploadCloud = createIcon('UploadCloud', 'cloud-arrow-up')
export const X = createIcon('X', 'xmark')
export const Book = createIcon('Book', 'book')
export const ShieldCheck = createIcon('ShieldCheck', 'shield-check')
export const Search = createIcon('Search', 'magnifying-glass')
export const Layers = createIcon('Layers', 'layer-group')
export const Sparkles = createIcon('Sparkles', 'sparkles')
export const HardDrive = createIcon('HardDrive', 'hard-drive')
export const Maximize2 = createIcon('Maximize2', 'expand')
