import { Pipe, PipeTransform } from '@angular/core';
import { FileUtils } from '@shared/utils/file.utils';

@Pipe({
  name: 'fileSize',
  standalone: true,
  pure: true
})
export class FileSizePipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '0 B';
    return FileUtils.humanFileSize(bytes);
  }
}
