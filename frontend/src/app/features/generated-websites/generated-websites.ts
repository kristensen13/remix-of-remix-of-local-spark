import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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

  readonly websites = this.websitesService.websites;
  readonly isLoading = this.websitesService.isLoading;
  readonly errorMessage = this.websitesService.errorMessage;

  readonly previewing = signal<GeneratedWebsite | null>(null);

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
