import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { SeriesService } from './series.service';
import { SerieFormModal } from './serie-form-modal';

@Component({
  selector: 'app-series',
  imports: [SerieFormModal],
  templateUrl: './series.html',
  styleUrl: './series.css',
})
export class Series implements OnInit {
  protected readonly seriesService = inject(SeriesService);

  @ViewChild(SerieFormModal) modal!: SerieFormModal;

  ngOnInit(): void {
    void this.seriesService.load();
  }

  onNew(): void {
    this.modal.openForCreate();
  }

  onSaved(): void {
    // No-op: SeriesService.create() already reloads the list itself,
    // and the modal closes itself on success. Bound to (saved) only so the
    // modal's documented output has a consumer.
  }
}
