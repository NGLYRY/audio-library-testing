# audio-library-testing
checklist 
1. Find a library that converts speech to text, and gives you timestamps of the text.
2. Find a library to select the most informative words, for example the less frequent in English.
3. Start working so, when you speed forward, you jump through the informative words at a speed close to the playback speed set by the slider (when the speed in the slider is greater than 2).

1a. Still deciding between Vosk or a cloud api like google cloud speech to text api for task 1

2a. There are TF-IDF libraries that measure the semantic weight of words in a corpus. But it will be easier to find measure the rarest word and out put it through the +2x speed

3a. Haven't started
