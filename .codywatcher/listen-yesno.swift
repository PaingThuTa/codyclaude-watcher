import Foundation
import Speech
import AVFoundation

let args = CommandLine.arguments

// Parse --timeout flag (default 10s)
var timeout: TimeInterval = 10
if let idx = args.firstIndex(of: "--timeout"),
   let next = args.index(idx, offsetBy: 1, limitedBy: args.count - 1),
   let t = TimeInterval(args[next]) {
  timeout = t
}

// Parse --mode flag: "wake" or "decision" (default)
var mode = "decision"
if let idx = args.firstIndex(of: "--mode"),
   let next = args.index(idx, offsetBy: 1, limitedBy: args.count - 1) {
  mode = args[next]
}

let wakeWords: Set<String> = ["hello", "yo", "hey", "hi", "yeah", "cody", "ok", "okay"]

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

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
      recognizer.isAvailable else {
  print("SFSpeechRecognizer not available")
  exit(2)
}

let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)
let request = SFSpeechAudioBufferRecognitionRequest()

inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
  request.append(buffer)
}

var resolved = false

let task = recognizer.recognitionTask(with: request) { result, error in
  guard let result = result, !resolved else { return }

  let transcription = result.bestTranscription.formattedString.lowercased()
  let words = Set(transcription.components(separatedBy: .whitespaces))

  if mode == "wake" {
    if !wakeWords.intersection(words).isEmpty {
      resolved = true
      audioEngine.stop()
      exit(0)
    }
  } else {
    // decision mode
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
}

do {
  try audioEngine.start()
} catch {
  print("AVAudioEngine start failed: \(error)")
  task.cancel()
  exit(2)
}

RunLoop.main.run(until: Date(timeIntervalSinceNow: timeout))

audioEngine.stop()
task.cancel()
exit(2)
