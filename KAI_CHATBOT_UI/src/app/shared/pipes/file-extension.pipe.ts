import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fileExtension',
  standalone: true,
  pure: true
})
export class FileExtensionPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return (name || '').split('.').pop()?.toUpperCase() || '';
  }
}
