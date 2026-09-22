use std::fs::File;
use std::path::Path;
use memmap2::Mmap;

pub fn fast_hash_bytes(bytes: &[u8]) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

pub fn fast_hash_file<P: AsRef<Path>>(path: P) -> std::io::Result<u32> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;

    if metadata.len() == 0 {
        return Ok(0);
    }

    // Use memory mapping for instant read of any file size
    let mmap = unsafe { Mmap::map(&file)? };
    Ok(fast_hash_bytes(&mmap))
}
