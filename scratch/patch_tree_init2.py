with open('src/components/chat_project/ChatProjectPreview.tsx', 'r') as f:
    content = f.read()

old = """                    onToggle={toggle}
                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                  />"""
new = """                    onToggle={toggle}
                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                    fileManager={fileManager}
                    appRootPath={appRootPath}
                  />"""
content = content.replace(old, new)

with open('src/components/chat_project/ChatProjectPreview.tsx', 'w') as f:
    f.write(content)
