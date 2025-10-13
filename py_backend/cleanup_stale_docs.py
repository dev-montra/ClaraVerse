"""
Clean up stale document IDs from LightRAG storage

This script removes old document IDs from the _doc_status storage file
that are preventing document retries from working correctly.
"""

import json
from pathlib import Path

def cleanup_stale_docs(notebook_id: str):
    """Remove stale document IDs from LightRAG storage"""
    
    # Path to the doc_status storage file
    storage_path = Path(f"C:\\Users\\prave\\.clara\\lightrag_storage\\{notebook_id}\\kv_store_doc_status.json")
    
    if not storage_path.exists():
        print(f"❌ Storage file not found: {storage_path}")
        return
    
    print(f"📂 Loading doc_status from: {storage_path}")
    
    # Load the current storage
    with open(storage_path, 'r', encoding='utf-8') as f:
        doc_status = json.load(f)
    
    print(f"📊 Current doc_status entries: {len(doc_status)}")
    
    # Show all document IDs
    for doc_id in doc_status.keys():
        print(f"   - {doc_id}")
    
    # Ask user which ones to remove
    print("\n🧹 Which document IDs should we remove?")
    print("   Enter document ID patterns (e.g., '1760290028073' to remove docs with that timestamp)")
    print("   Or 'all' to remove all entries")
    print("   Or 'cancel' to abort")
    
    choice = input("\nYour choice: ").strip()
    
    if choice.lower() == 'cancel':
        print("❌ Cancelled")
        return
    
    if choice.lower() == 'all':
        print(f"\n⚠️  Are you sure you want to remove ALL {len(doc_status)} entries?")
        confirm = input("Type 'yes' to confirm: ").strip()
        if confirm.lower() != 'yes':
            print("❌ Cancelled")
            return
        doc_status.clear()
        print(f"✅ Removed all entries")
    else:
        # Remove entries matching the pattern
        pattern = choice
        to_remove = [doc_id for doc_id in doc_status.keys() if pattern in doc_id]
        
        if not to_remove:
            print(f"❌ No documents found matching pattern: {pattern}")
            return
        
        print(f"\n🗑️  Found {len(to_remove)} documents to remove:")
        for doc_id in to_remove:
            print(f"   - {doc_id}")
        
        confirm = input(f"\nRemove these {len(to_remove)} entries? (yes/no): ").strip()
        if confirm.lower() != 'yes':
            print("❌ Cancelled")
            return
        
        for doc_id in to_remove:
            del doc_status[doc_id]
        print(f"✅ Removed {len(to_remove)} entries")
    
    # Save the cleaned storage
    print(f"\n💾 Saving cleaned doc_status...")
    with open(storage_path, 'w', encoding='utf-8') as f:
        json.dump(doc_status, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Cleanup complete! Remaining entries: {len(doc_status)}")

if __name__ == "__main__":
    print("🔧 LightRAG Document Storage Cleanup Tool")
    print("=" * 50)
    
    notebook_id = input("\nEnter notebook ID: ").strip()
    
    if not notebook_id:
        print("❌ No notebook ID provided")
    else:
        cleanup_stale_docs(notebook_id)
