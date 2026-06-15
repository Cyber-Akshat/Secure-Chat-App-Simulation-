// Updates the list of online users displayed in the sidebar
function updateUserList(usernames) {

  // Get the <ul> element that contains the user list
  const userList = document.getElementById("users");

  // Remove all existing user entries before rebuilding the list
  userList.replaceChildren();

  // Loop through each username received from the server
  for (const username of usernames) {

    // Create a new <li> element for this user
    const listItem = document.createElement("li");

    // Set the visible text of the list item to the username
    listItem.textContent = username;

    // Add a tooltip that appears when the user hovers over the username
    // Example: "Alice is connected and active in this server."
    listItem.setAttribute(
      "title",
      `${username} is connected and active in this server.`
    );

    // Add the completed list item to the online users list
    userList.appendChild(listItem);
  }
}