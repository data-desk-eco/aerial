// the reads the detectors post ahead of making them, fetched here, off the
// page's thread, into the http cache their own blocking reads are answered
// from: [url, range] at a time
onmessage = ({ data: [u, Range] }) => fetch(u, Range && { headers: { Range } })
    .then(r => r.arrayBuffer()).catch(() => {});
