with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

old = """                  onSelect={handleSelect}
                />"""
new = """                  onSelect={handleSelect}
                  fileManager={fileManager}
                  appRootPath={appRootPath}
                />"""
content = content.replace(old, new)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
