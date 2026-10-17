On Error Resume Next

Set photoshop = Nothing
For attempt = 1 To 5
  Err.Clear
  Set photoshop = CreateObject("Photoshop.Application")
  If Err.Number = 0 Then Exit For
  WScript.Sleep 2000
Next

If photoshop Is Nothing Then
  WScript.Echo "Photoshop could not be started: " & Err.Description
  WScript.Quit 1
End If

photoshop.Visible = True
Err.Clear
photoshop.DoJavaScriptFile "C:\Users\libar\Desktop\autolisty\scripts\generate-mockup-previews.jsx"

If Err.Number <> 0 Then
  WScript.Echo "Preview generation failed: " & Err.Description
  WScript.Quit 1
End If

WScript.Echo "Preview generation completed."
WScript.Quit 0
