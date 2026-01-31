# Exercise demo videos

To show a YouTube demo video on the exercise detail screen, add mappings in `exercise-videos.json`:

```json
{
  "bench_press_barbell_flat": "rT7DgCr-3pg",
  "squat_barbell_back": "YOUR_VIDEO_ID"
}
```

- **Key**: exercise ID from `exercises_5000plus.json` (e.g. `bench_press_barbell_flat`).
- **Value**: YouTube video ID (the 11 characters from `youtube.com/watch?v=VIDEO_ID`).

Leave the file as `{}` if you don't want any videos. Add entries over time as you find good form/demo videos.
