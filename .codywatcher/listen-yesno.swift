import Foundation
import Speech
import AVFoundation

// Parse --timeout flag (default 10s)
var timeout: TimeInterval = 10
let args = CommandLine.arguments
if let idx = args.firstIndex(of: "--timeout"),
   let idxPlus1 = args.index(idx, offsetBy: 1, limitedBy: args.count - 1) {
  if let t = TimeInterval(args[idxPlus1]) {
    timeout = t
  }
}

// Semaphore to block until authorization callback fires
let authSemaphore = DispatchSemaphore(value: 0)

SFSpeechRecognizer.requestAuthorization { status in
  if status != .authorized {
    print("Speech recognition not authorized: \(status.rawValue)")
    exit(2)
  }
  authSemaphore.signal()
}
authSemaphore.wait()

// Check recognizer availability
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
      recognizer.isAvailable else {
  print("SFSpeechRecognizer not available")
  exit(2)
}

// Create audio engine and recognition request
let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)

let request = SFSpeechAudioBufferRecognitionRequest()

inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
  request.append(buffer)
}

// Track whether recognition resolved
var resolved = false

// Start recognition task
let task = recognizer.recognitionTask(with: request) { result, error in
  guard let result = result, !resolved else { return }

  let transcription = result.bestTranscription.formattedString.lowercased()
  if transcription.contains("yes") {
    resolved = true
    audioEngine.stop()
    exit(0)
  } else if transcription.contains("no") {
    resolved = true
    audioEngine.stop()
    exit(1)
  }
}

// Start audio engine
do {
  try audioEngine.start()
} catch {
  print("AVAudioEngine start failed: \(error)")
  task.cancel()
  exit(2)
}

// Keep run loop alive for the recognition window
RunLoop.main.run(until: Date(timeIntervalSinceNow: timeout))

// Timeout reached — no confident match
audioEngine.stop()
task.cancel()
exit(2)
