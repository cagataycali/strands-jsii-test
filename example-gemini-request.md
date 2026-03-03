curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'X-goog-api-key: AIzaSyDkO2Q6_3cSYlSfvsUB5N_QELTxwI6oT1M' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
# Response
{
"candidates": [
{
    "content": {
    "parts": [
        {
        "text": "Finds patterns in data to predict outcomes.",
        "thoughtSignature": "EtwGCtkGAb4+9vtB181h14556835njWUBTSnPERT2R22DxrVk5kC7v8A3SAY+Hpl+MLNvMgKbYszlbBO0vt+QTnBHsAByYhLnyjU9uwIeyUNEUg7qR5Q3aht1vklYJsbpJlNbQIHho4dNC0LaD3pX/CQaTxhvoTQ3Y7qkSabJU+GdgRQvs6Ehw6AEXQsRFOywEqJjCiToloM216FEnZ1QSBs8+WRXnFg/3MBj4YYqNfTqNe3D9bY4YFDDbI7JN1jB1SDBqXF7bheh5lCUGBQYAAmU4PTs/4Pzdyf76FmjbINKAoDL01LXTU5p9qPqcg5kid9JIP06rVN+haqavkwoluzDNNDQP/zvVFhlNbUKHvAmtdFQU3uLA6LxXv56rggktRzcYvC9gISAm8I+VOQT9x0PcMB9yfWQtHKFhB3i5lKbp1jDq6LsCljMzvgaxU1kuKKKWT39YhPbD5upe7E20NbxAWH2iUTjyJcrneQn3G5bXQ5dtVDovrMKW4n1D6Lx78flUyKBoXWOeTLNwmDbrYZPrjKKRuhlqGykHqR/NETthHtERQv/7Sqt3Yso45XUJkwCq81ckcYXUs0fTnyBfzkzQYDInziOC46s35eEMe5njIp3UgOJ2ucG4exeluvATQ/tLX1FIxVxhIAqDRvJ3SypkHDhi8Qr1q0l5q6Mc9XIaFKGLVtIuqRWG1Fj2xBvIVqb70ll71fGpedoKTg1MZQ3MuF0iZAeLyZ25wu5X+ufVhh0Mz+x7lMZeeuWD/vfa3oCkBu4hUAZOWc0WvZ+YIfGt/W9o2J9W6tCDwTFUCb5A+F1K551k4CIAgRjqlaLFZ67cDjY028ECQ69KWlswBKaMhW0+U7MJMW/GL8xnjD3akH6sq2bTzozQ/iYqu6oanV5KMd89VF9CPMqrxPhgtnVntWksXH5MCwnvpApBVCvNSwTzNEz2+15btzTU4AdinpBOGdpHkNdi9p6czjXAWTO1aRm5o1yLPX8BsSvj894nHX4DbPBOhEH25ZnqEn8kLjdxGTuHO1nnKFbzXYZzIXhfzhBB8LcsC0jBuW3kwOdIcaQx/EkMophpwna5noba3LswjPkm0uRgnxuxLrLlz++c/EJ6095WVqJdbbBzbMXrY35x6lXKv8eeEUDjM="
        }
    ],
    "role": "model"
    },
    "finishReason": "STOP",
    "index": 0
}
],
"usageMetadata": {
"promptTokenCount": 8,
"candidatesTokenCount": 9,
"totalTokenCount": 228,
"promptTokensDetails": [
    {
    "modality": "TEXT",
    "tokenCount": 8
    }
],
"thoughtsTokenCount": 211
},
"modelVersion": "gemini-3-flash-preview",
"responseId": "KSunaeWKFdO--sAPnLvs6QY"
}
(base) c² ~/strands-jsii/ [main*] 
