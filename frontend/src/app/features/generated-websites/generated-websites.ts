import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { GeneratedWebsitesService } from './generated-websites.service';
import { GeneratedWebsite } from '../../core/models/website.models';

@Component({
  selector: 'app-generated-websites',
  imports: [DatePipe],
  templateUrl: './generated-websites.html',
  styleUrl: './generated-websites.css',
})
export class GeneratedWebsites implements OnInit {
  private readonly websitesService = inject(GeneratedWebsitesService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly websites = this.websitesService.websites;
  readonly isLoading = this.websitesService.isLoading;
  readonly errorMessage = this.websitesService.errorMessage;

  readonly previewing = signal<GeneratedWebsite | null>(null);

  // The AI-generated marketing page is always the current authenticated
  // user's own content (never arbitrary third-party input), and the iframe's
  // `sandbox` attribute (no value = maximum restrictions) is what actually
  // keeps it safe. Angular's built-in HTML sanitizer strips <style>/<link>
  // tags and unwraps <html>/<head>/<body>, which would flatten the preview
  // into unstyled markup, so we bypass it here and rely on sandboxing instead.
  readonly previewSrcdoc = computed<SafeHtml | null>(() => {
    const website = this.previewing();
    return website ? this.sanitizer.bypassSecurityTrustHtml(website.generatedContent) : null;
  });

  ngOnInit(): void {
    void this.websitesService.loadWebsites();
  }

  preview(website: GeneratedWebsite): void {
    this.previewing.set(website);
  }

  closePreview(): void {
    this.previewing.set(null);
  }
}
