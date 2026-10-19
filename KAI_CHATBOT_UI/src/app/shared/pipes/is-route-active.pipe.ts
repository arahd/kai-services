import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'isRouteActive',
  standalone: true,
  pure: true
})
export class IsRouteActivePipe implements PipeTransform {
  transform(path: string, currentUrl: string): boolean {
    try {
      return (currentUrl || '').startsWith(path);
    } catch {
      return false;
    }
  }
}
