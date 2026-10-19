import { Pipe, PipeTransform } from '@angular/core';
import { FileUtils } from '@shared/utils/file.utils';

@Pipe({
  name: 'fileType',
  standalone: true,
  pure: true
})
export class FileTypePipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return FileUtils.getFileType(name || '');
  }
}
