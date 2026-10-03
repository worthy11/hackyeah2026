## Part 1: Rig the available avatar

This part is completed by proving that the provided avatar can be rigged using MediaPipe landmarks, ideally in sync with the webcam.

## Part 2: Learning module

### A: Avatar-backed gesture and phrase learning

Available gestures and phrases are grouped by topic. Start with common topics, such as:

- greetings / small talk
- family members
- describing appearance (height, weight, hair color/length, etc.)
- describing emotions (joy, anger, sadness, surprise, etc.)
- directions and transport
- foods
- etc.

### B: Translation help

## Part 3: Translation module

Use existing API endpoints that process video inputs from 2B - users upload videos (either from their device or directly via recording - more of a mobile approach) and receive a Polish translation of the gesture sequence (pose -> segmentation -> classification -> gloss translation).
